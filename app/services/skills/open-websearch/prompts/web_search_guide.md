# Web Search Guide

You have access to two web search tools: `web_search` and `fetch_web_content`.

## When to use web search

Use `web_search` when you need:
- Current information not in your training data
- Specific facts, prices, or data that changes over time
- Documentation, API references, or changelogs
- News, events, or recent developments
- Verification of claims or facts

## How to search effectively

**Be specific.** Narrow queries return better results than broad ones.
- Bad: `how to code`
- Good: `Python asyncio gather exception handling 2024`

**Search for the right thing.** If you need a package's API, search for its docs page, not a tutorial.

**Use multiple searches.** Don't assume one search gives you everything. Search for the main topic, then follow up with specific sub-questions.

**Read the actual pages.** Search snippets are often incomplete. Use `fetch_web_content` to read the full page when a result looks relevant.

## Using fetch_web_content

Use `fetch_web_content` to:
- Read the full content of a search result
- Fetch documentation pages directly by URL
- Read GitHub READMEs or raw files

Only fetch public URLs. Do not attempt to fetch local network addresses.

## Search result format

`web_search` returns an array of results with:
- `title` — page title
- `url` — page URL
- `snippet` — short excerpt from the page

Always cite your sources when using information from web search results.
