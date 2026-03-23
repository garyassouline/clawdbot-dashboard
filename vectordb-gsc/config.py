import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

GSC_PROPERTY = os.getenv("GSC_PROPERTY", "")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "service_account.json")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
PARALLEL_API_KEY = os.getenv("PARALLEL_API_KEY", "")

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

EMBEDDING_MODEL = "gemini-embedding-2-preview"
EMBEDDING_DIMENSIONS = 768
GEMINI_MODEL = "gemini-3-flash-preview"
CLAUDE_MODEL = "claude-opus-4-6"
GROK_MODEL = "grok-4-1-fast-non-reasoning"
XAI_BASE_URL = "https://api.x.ai/v1"

CHROMA_DB_PATH = "chroma_db"
RAW_DATA_DIR = "raw_data"

QUERIES_COLLECTION = "gsc_queries"
PAGES_COLLECTION = "gsc_pages"
DISCOVER_COLLECTION = "gsc_discover"

EMBEDDING_BATCH_SIZE = 50
GSC_ROW_LIMIT = 25000

def get_date_range(months=3):
    """Recent data range (default: last 3 months)."""
    end_date = datetime.now() - timedelta(days=3)
    start_date = end_date - timedelta(days=months * 30)
    return start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")


def get_previous_year_range():
    """Full previous calendar year (for top articles)."""
    now = datetime.now()
    start = datetime(now.year - 1, 1, 1)
    end = datetime(now.year - 1, 12, 31)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
