"""Reddit Pain Radar worker package.

A standalone, scheduled backend worker: it fetches Reddit posts, extracts
pain signals (regex prefilter + DeepSeek LLM), scores them, and renders
markdown/email reports. There is no web server or frontend here.
"""

__version__ = "0.1.0"
