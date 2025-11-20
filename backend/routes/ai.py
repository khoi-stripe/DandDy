"""
AI Service Routes - Secure proxy for OpenAI API calls
This prevents exposing API keys to the frontend
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
import openai
from database.database import get_settings

router = APIRouter(tags=["AI"])

# Rate limiting in-memory storage (use Redis in production)
_rate_limit_store = defaultdict(list)

# Load configuration from settings
settings = get_settings()
OPENAI_API_KEY = settings.openai_api_key
MAX_REQUESTS_PER_MINUTE = settings.max_requests_per_user_per_minute
MAX_REQUESTS_PER_DAY = settings.max_requests_per_user_per_day

if not OPENAI_API_KEY:
    print("⚠️  WARNING: OPENAI_API_KEY not set. AI features will be disabled.")

# Initialize OpenAI client
openai.api_key = OPENAI_API_KEY


# Request/Response models
class ChatCompletionRequest(BaseModel):
    """Request for chat completion (narrator, names, backstory)"""
    prompt: str = Field(..., min_length=1, max_length=2000)
    system_prompt: Optional[str] = Field(None, max_length=2000)
    max_tokens: int = Field(300, ge=50, le=1000)
    temperature: float = Field(0.8, ge=0.0, le=2.0)


class ImageGenerationRequest(BaseModel):
    """Request for DALL-E image generation"""
    prompt: str = Field(..., min_length=10, max_length=4000)
    size: str = Field("1024x1024", pattern="^(256x256|512x512|1024x1024|1792x1024|1024x1792)$")
    quality: str = Field("standard", pattern="^(standard|hd)$")


class NamesGenerationRequest(BaseModel):
    """Request for character name generation"""
    race: str = Field(..., min_length=1, max_length=50)
    class_type: str = Field(..., min_length=1, max_length=50)
    count: int = Field(3, ge=1, le=10)


class BackstoryGenerationRequest(BaseModel):
    """Request for backstory generation"""
    name: str = Field(..., min_length=1, max_length=100)
    race: str = Field(..., min_length=1, max_length=50)
    class_type: str = Field(..., min_length=1, max_length=50)
    personality: Optional[str] = None
    background: Optional[str] = None


class NarratorCommentRequest(BaseModel):
    """Request for narrator comment"""
    choice: str = Field(..., min_length=1, max_length=200)
    question: str = Field(..., min_length=1, max_length=500)
    character_so_far: dict
    narrator_id: str = Field(default='deadpan', max_length=50)


# Helper functions
def check_api_key():
    """Check if OpenAI API key is configured"""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI service is not configured. Please contact the administrator."
        )


def get_client_id(request: Request) -> str:
    """Get a unique identifier for the client (IP address or user ID)"""
    # In production, use authenticated user ID instead
    return request.client.host if request.client else "unknown"


def check_rate_limit(client_id: str):
    """Simple rate limiting (use Redis in production)"""
    now = datetime.now()
    
    # Clean old entries
    _rate_limit_store[client_id] = [
        timestamp for timestamp in _rate_limit_store[client_id]
        if now - timestamp < timedelta(days=1)
    ]
    
    # Check per-minute limit
    recent_requests = [
        timestamp for timestamp in _rate_limit_store[client_id]
        if now - timestamp < timedelta(minutes=1)
    ]
    if len(recent_requests) >= MAX_REQUESTS_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {MAX_REQUESTS_PER_MINUTE} requests per minute."
        )
    
    # Check per-day limit
    if len(_rate_limit_store[client_id]) >= MAX_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=f"Daily rate limit exceeded. Max {MAX_REQUESTS_PER_DAY} requests per day."
        )
    
    # Record this request
    _rate_limit_store[client_id].append(now)


# Routes
@router.get("/status")
async def get_ai_status():
    """Check if AI service is available"""
    return {
        "available": OPENAI_API_KEY is not None,
        "provider": "openai",
        "features": {
            "chat": OPENAI_API_KEY is not None,
            "images": OPENAI_API_KEY is not None
        }
    }


@router.post("/chat/completion")
async def chat_completion(
    request: ChatCompletionRequest,
    http_request: Request
):
    """Generate chat completion (for narrator, names, backstory)"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    try:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})
        
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        content = response.choices[0].message.content.strip()
        
        return {
            "success": True,
            "content": content,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        }
    
    except openai.RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit exceeded. Please try again later.")
    except openai.APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate completion: {str(e)}")


@router.post("/images/generate")
async def generate_image(
    request: ImageGenerationRequest,
    http_request: Request
):
    """Generate image using DALL-E"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    try:
        response = openai.images.generate(
            model="dall-e-3",
            prompt=request.prompt,
            n=1,
            size=request.size,
            quality=request.quality
        )
        
        return {
            "success": True,
            "url": response.data[0].url,
            "revised_prompt": response.data[0].revised_prompt
        }
    
    except openai.RateLimitError as e:
        raise HTTPException(status_code=429, detail="OpenAI rate limit exceeded. Please try again later.")
    except openai.APIError as e:
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")


# Narrator personality system prompts
NARRATOR_PROMPTS = {
    'deadpan': 'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',
    
    'enthusiastic': 'You are an enthusiastic, energetic D&D narrator who loves every choice the player makes. You\'re supportive, use exclamation points, and celebrate creativity. Think of an excited bard hyping up their party. Keep responses under 50 words. Be positive, encouraging, and dramatic.',
    
    'mysterious': 'You are a mysterious, cryptic D&D narrator who speaks in riddles and hints at hidden meanings. You\'re enigmatic, slightly foreboding, and reference fate and destiny. Keep responses under 50 words. Be mystical, vague, and occasionally ominous. Use metaphors and speak of paths not taken.',
    
    'grumpy': 'You are a grumpy, world-weary D&D narrator who has seen too many adventurers fail. You\'re cranky, unimpressed, and think most choices are questionable at best. Keep responses under 50 words. Be curmudgeonly, skeptical, and frequently exasperated. Complain about "kids these days" and reference how things were better in the old days.',
    
    'chaotic': 'You are a chaotic, mischievous D&D narrator who delights in mayhem and unexpected outcomes. You\'re playful, slightly unhinged, and love when things go off the rails. Keep responses under 50 words. Be impish, unpredictable, and suggest the most entertaining (not safest) options. Cackle at good chaos.',
    
    'scholarly': 'You are a scholarly, well-read D&D narrator who references game rules, lore, and historical precedent. You\'re precise, informative, and occasionally go on brief tangents about interesting facts. Keep responses under 50 words. Be educational but not boring, cite mechanics when relevant, and provide context about the world.',
    
    'dude': 'You are an extremely laid-back, chill D&D narrator inspired by The Dude from The Big Lebowski. You\'re zen, use casual slang like "man" and "dude," and never stress about anything. Keep responses under 50 words. Be relaxed, philosophical in a lazy way, reference bowling or taking it easy, and always go with the flow. That\'s just like, your opinion, man.',
}

@router.post("/narrator/comment")
async def generate_narrator_comment(
    request: NarratorCommentRequest,
    http_request: Request
):
    """Generate narrator comment for character creation"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    # Get system prompt based on narrator personality
    system_prompt = NARRATOR_PROMPTS.get(request.narrator_id, NARRATOR_PROMPTS['deadpan'])
    
    user_prompt = (
        f"The player chose: {request.choice} for {request.question}. "
        f"Their character so far: {request.character_so_far}. "
        "Make a brief comment about their choice that fits your personality."
    )
    
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=100,
            temperature=0.8
        )
        
        return {
            "success": True,
            "comment": response.choices[0].message.content.strip()
        }
    
    except Exception as e:
        # Return fallback on error (using deadpan fallbacks as default)
        fallbacks = [
            'Interesting choice. ( ._. )',
            "Well, that tracks.",
            "Bold move. We'll see how that works out.",
            'Sure. Why not.',
        ]
        import random
        return {
            "success": False,
            "comment": random.choice(fallbacks),
            "error": str(e)
        }


@router.post("/characters/names")
async def generate_character_names(
    request: NamesGenerationRequest,
    http_request: Request
):
    """Generate character names"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    prompt = (
        f"Generate {request.count} fantasy character names suitable for a "
        f"{request.race} {request.class_type} in D&D. "
        "Just list the names, one per line, nothing else."
    )
    
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.9
        )
        
        content = response.choices[0].message.content.strip()
        # Parse names from response
        names = [
            name.strip()
            for name in content.split('\n')
            if name.strip()
        ]
        # Remove leading numbers
        names = [name.split('. ', 1)[-1].split(') ', 1)[-1] for name in names]
        
        return {
            "success": True,
            "names": names[:request.count]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate names: {str(e)}")


@router.post("/characters/backstory")
async def generate_character_backstory(
    request: BackstoryGenerationRequest,
    http_request: Request
):
    """Generate character backstory"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    prompt = (
        f"Create a brief (100 words max) backstory for: {request.name}, "
        f"a {request.race} {request.class_type}. "
    )
    if request.personality:
        prompt += f"Personality: {request.personality}. "
    if request.background:
        prompt += f"Background: {request.background}. "
    prompt += "Make it dramatic but deadpan in tone."
    
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.8
        )
        
        return {
            "success": True,
            "backstory": response.choices[0].message.content.strip()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate backstory: {str(e)}")

