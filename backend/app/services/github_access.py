"""
GitDecode — GitHub Access Service
=================================
Validates repository accessibility (public or private) via the GitHub API.
"""

import logging
import re
import httpx

logger = logging.getLogger(__name__)

GITHUB_API_BASE = "https://api.github.com"


def parse_owner_repo(repo_url: str) -> tuple[str, str] | None:
    """Extract (owner, repo) from a GitHub HTTPS URL."""
    clean_url = repo_url.rstrip("/").removesuffix(".git")
    match = re.search(r"github\.com/([\w.\-]+)/([\w.\-]+)$", clean_url)
    if match:
        return match.group(1), match.group(2)
    return None


async def check_repo_access(repo_url: str, github_token: str | None = None) -> dict:
    """
    Check if a repository is accessible on GitHub using optional OAuth token.

    Returns:
        dict: {
            "accessible": bool,
            "private": bool,
            "name": str,
            "full_name": str,
            "description": str | None,
            "default_branch": str,
            "stargazers_count": int,
            "language": str | None,
            "owner_avatar_url": str | None,
            "error_message": str | None,
        }
    """
    parsed = parse_owner_repo(repo_url)
    if not parsed:
        return {
            "accessible": False,
            "error_message": "Invalid GitHub repository URL format.",
        }

    owner, repo = parsed
    api_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "GitDecode-App",
    }
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(api_url, headers=headers)
            if res.status_code == 200:
                data = res.json()
                return {
                    "accessible": True,
                    "private": data.get("private", False),
                    "name": data.get("name", repo),
                    "full_name": data.get("full_name", f"{owner}/{repo}"),
                    "owner": owner,
                    "description": data.get("description"),
                    "default_branch": data.get("default_branch", "main"),
                    "stargazers_count": data.get("stargazers_count", 0),
                    "language": data.get("language", "TypeScript"),
                    "owner_avatar_url": data.get("owner", {}).get("avatar_url"),
                    "html_url": data.get("html_url", repo_url),
                }
            elif res.status_code == 404:
                return {
                    "accessible": False,
                    "error_message": "Repository not found or access denied. If this is a private repository, please ensure you are signed in with GitHub.",
                }
            elif res.status_code == 401 or res.status_code == 403:
                return {
                    "accessible": False,
                    "error_message": "Access forbidden. Your GitHub account may not have permission for this repository.",
                }
            else:
                return {
                    "accessible": False,
                    "error_message": f"GitHub API error (status {res.status_code}).",
                }
        except Exception as e:
            logger.warning("GitHub access check failed for %s: %s", repo_url, str(e))
            return {
                "accessible": False,
                "error_message": f"Network error checking repository access: {str(e)}",
            }
