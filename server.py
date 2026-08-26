"""Local FastAPI bridge from the Studio chatbox to Claude."""

from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llm import route_message

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: List[HistoryTurn] = Field(default_factory=list)
    apps: List[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    app: Optional[str] = None


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is empty.")
    try:
        result = route_message(
            message,
            history=[t.model_dump() for t in req.history],
            available_apps=req.apps,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="The assistant could not reply.") from exc
    return ChatResponse(reply=result["reply"], app=result.get("app"))
