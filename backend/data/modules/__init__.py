# Adventure modules
from .red_demon import RED_DEMON_MODULE

MODULES = {
    "red_demon": RED_DEMON_MODULE,
}


def get_module(name: str) -> dict | None:
    """Get an adventure module by name."""
    return MODULES.get(name)

