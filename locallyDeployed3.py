"""Chatbot using Google's Gemini Multimodal Live model.

Features:
- Real-time audio/video transport via Daily.co
- Live context streaming with Gemini LLM service
- Voice activity detection with Silero VAD
- Transcript processing and UI event handling via RTVI
"""

import os
import asyncio
import aiohttp

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.transports.services.daily import DailyParams, DailyTransport

from pipecat.services.gemini_multimodal_live.gemini import GeminiMultimodalLiveLLMService
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.transcript_processor import TranscriptProcessor, TranscriptionMessage
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIObserver, RTVIProcessor

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.pipeline.runner import PipelineRunner

from pipecatcloud.agent import DailySessionArguments

# Load all environment variables from .env (override any existing ones)
load_dotenv(override=True)

# A simple default instruction to kick off the conversation
system_instruction = "Read to me the opening two sentences of Pride and Prejudice."

async def main(room_url: str, token: str):
    """Launch the chatbot in the given Daily room.

    Args:
        room_url: URL of the Daily meeting room.
        token: Authentication token for that room.
    """
    # 1. Set up Daily transport with audio in/out and VAD
    transport = DailyTransport(
        room_url,
        token,
        "Chatbot",
        DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.5)),
        ),
    )

    # 2. Initialize Gemini Multimodal Live LLM service
    llm = GeminiMultimodalLiveLLMService(
        api_key=os.getenv("GEMINI_API_KEY"),
        voice_id="Kore",  
        system_instruction=system_instruction,
    )

    # 3. Create the chat context and aggregator
    initial_context = OpenAILLMContext([{"role": "user", "content": "Just begin"}])
    context_aggregator = llm.create_context_aggregator(initial_context)

    # 4. Track and forward transcripts
    transcript = TranscriptProcessor()

    # 5. Configure RTVI for UI-side events
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))

    # 6. Build the Pipecat pipeline stages
    pipeline = Pipeline([
        transport.input(),
        rtvi,
        context_aggregator.user(),
        llm,
        transcript.user(),
        transport.output(),
        transcript.assistant(),
        context_aggregator.assistant(),
    ])

    # 7. Wrap pipeline in a task with audio conversion and metrics
    task = PipelineTask(
        pipeline=pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=44100,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[RTVIObserver(rtvi)],
    )

    # Event handlers ----------------------------------------------------------

    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(_t, participant):
        """Start capturing speech when the first user appears."""
        logger.info("First participant joined: %s", participant["id"])
        await transport.capture_participant_transcription(participant["id"])

    @transport.event_handler("on_participant_left")
    async def on_participant_left(_t, participant, _reason):
        """Stop the task and clean up when everyone leaves."""
        logger.info("Participant left: %s", participant)
        await task.cancel()
        await transport.cleanup()

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(_rtvi):
        """Inform the UI that the bot is now ready to chat."""
        await rtvi.set_bot_ready()

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_t, _client):
        """Send initial system prompt as soon as the UI client connects."""
        logger.info("UI client connected")
        await task.queue_frames([context_aggregator.user().get_context_frame()])

    @transcript.event_handler("on_transcript_update")
    async def on_transcript_update(_proc, frame):
        """Log every new transcript message."""
        for msg in frame.messages:
            if isinstance(msg, TranscriptionMessage):
                prefix = f"[{msg.timestamp}] " if msg.timestamp else ""
                logger.info("%s%s: %s", prefix, msg.role, msg.content)

    # Runner ------------------------------------------------------------------

    runner = PipelineRunner()
    try:
        # Blocks until the conversation task completes or is cancelled
        await runner.run(task)
    finally:
        # Always clean up transport and task resources
        await transport.cleanup()
        await task.cleanup()


async def bot(args: DailySessionArguments):
    """FastAPI-compatible entrypoint for Daily session invocations."""
    logger.info("Starting bot for room: %s", args.room_url)
    try:
        await main(room_url=args.room_url, token=args.token)
        logger.info("Bot session finished")
    except Exception as e:
        logger.exception("Bot error: %s", e)
        raise


async def local_main(room_url: str = None, token: str = None):
    """Run the bot locally, provisioning a room if necessary."""
    try:
        async with aiohttp.ClientSession() as session:
            if not room_url or not token:
                logger.info("No room URL/token given—provisioning new room")
                room_url, token = await configure(session)

            logger.warning("Connect to voice agent at: %s", room_url)
            await main(room_url, token)
    except Exception as e:
        logger.exception("Local development error: %s", e)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Daily bot locally")
    parser.add_argument("-u", "--url", help="Daily room URL")
    parser.add_argument("-t", "--token", help="Daily room token")
    args = parser.parse_args()

    try:
        asyncio.run(local_main(room_url=args.url, token=args.token))
    except Exception as e:
        logger.exception("Failed to run local bot: %s", e)