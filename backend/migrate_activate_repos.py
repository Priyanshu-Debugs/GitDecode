"""
GitMesh — One-time Migration Script
=====================================
Re-activates all previously deactivated repositories.

Run this once after deploying the toggle-removal changes.
All repos are now permanently active for free users.

Usage:
    python migrate_activate_repos.py
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    exit(1)

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def migrate():
    # 1. Find all deactivated repos
    response = (
        client.table("repos")
        .select("id, user_id, github_url, is_active")
        .eq("is_active", False)
        .execute()
    )

    deactivated = response.data
    if not deactivated:
        print("No deactivated repos found. Nothing to migrate.")
        return

    print(f"Found {len(deactivated)} deactivated repo(s). Re-activating...")

    for repo in deactivated:
        print(f"  → Activating repo {repo['id']} ({repo['github_url']}) for user {repo['user_id']}")
        client.table("repos").update({"is_active": True}).eq("id", repo["id"]).execute()

    print(f"\nDone! {len(deactivated)} repo(s) re-activated.")


if __name__ == "__main__":
    migrate()
