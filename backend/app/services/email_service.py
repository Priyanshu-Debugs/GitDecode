"""
GitMesh — Email Service
=========================
SMTP-based email sending for Pro upgrade notifications.
Uses Gmail SMTP with TLS (App Password authentication).
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _get_approval_html(first_name: str, github_username: str) -> str:
    """Generate the HTML body for a Pro approval email."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#0e0d0b;font-family:'Courier New',Courier,monospace;">
        <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
            <!-- Header -->
            <div style="border-bottom:1px solid #211f19;padding-bottom:24px;margin-bottom:32px;">
                <h1 style="color:#d8d3c5;font-size:24px;margin:0 0 8px 0;">
                    <span style="color:#83c167;">Git</span><span style="color:#d8d3c5;">Mesh</span>
                </h1>
                <p style="color:#8b8270;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:0.05em;">
                    subscription_notification.sh
                </p>
            </div>
            
            <!-- Status Badge -->
            <div style="background:rgba(131,193,103,0.08);border:1px solid rgba(131,193,103,0.2);padding:12px 16px;margin-bottom:24px;">
                <span style="color:#83c167;font-size:13px;font-weight:bold;">✓ PRO SUBSCRIPTION APPROVED</span>
            </div>
            
            <!-- Body -->
            <div style="color:#d8d3c5;font-size:14px;line-height:1.7;">
                <p style="margin:0 0 16px 0;">
                    <span style="color:#8b8270;">// </span>Hey {first_name},
                </p>
                <p style="margin:0 0 16px 0;">
                    Your <span style="color:#83c167;font-weight:bold;">GitMesh Developer (Pro)</span> subscription 
                    has been activated for your GitHub account 
                    <span style="color:#d8a657;">@{github_username}</span>.
                </p>
                <p style="margin:0 0 8px 0;color:#8b8270;">
                    // Your Pro features are now unlocked:
                </p>
                <div style="padding-left:16px;margin-bottom:24px;">
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Public &amp; Private repositories sync
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Depth-3 Deep-Scan BFS graph walk
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Priority ingestion queuing
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Pre-warmed Gemini Context Caching
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Unlimited diagram compilations
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#83c167;">✓</span> Dedicated Slack priority channel
                    </p>
                </div>
                <p style="margin:0 0 8px 0;color:#8b8270;">
                    // Your subscription is valid for <span style="color:#d8a657;">1 year</span> from today.
                </p>
                
                <!-- CTA Button -->
                <div style="margin:32px 0;">
                    <a href="https://gitmesh.in/dashboard" 
                       style="display:inline-block;background:#83c167;color:#0e0d0b;padding:12px 24px;text-decoration:none;font-weight:bold;font-size:13px;font-family:'Courier New',monospace;text-transform:uppercase;">
                        Open Dashboard →
                    </a>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="border-top:1px solid #211f19;padding-top:24px;margin-top:32px;">
                <p style="color:#8b8270;font-size:11px;margin:0;">
                    — The GitMesh Team<br>
                    <span style="color:#3a352b;">// This is an automated notification. Do not reply to this email.</span>
                </p>
            </div>
        </div>
    </body>
    </html>
    """


def _get_rejection_html(first_name: str, github_username: str) -> str:
    """Generate the HTML body for a Pro rejection email."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#0e0d0b;font-family:'Courier New',Courier,monospace;">
        <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
            <!-- Header -->
            <div style="border-bottom:1px solid #211f19;padding-bottom:24px;margin-bottom:32px;">
                <h1 style="color:#d8d3c5;font-size:24px;margin:0 0 8px 0;">
                    <span style="color:#83c167;">Git</span><span style="color:#d8d3c5;">Mesh</span>
                </h1>
                <p style="color:#8b8270;font-size:12px;margin:0;text-transform:uppercase;letter-spacing:0.05em;">
                    subscription_notification.sh
                </p>
            </div>
            
            <!-- Status Badge -->
            <div style="background:rgba(224,112,95,0.08);border:1px solid rgba(224,112,95,0.2);padding:12px 16px;margin-bottom:24px;">
                <span style="color:#e0705f;font-size:13px;font-weight:bold;">✗ PRO REQUEST NOT APPROVED</span>
            </div>
            
            <!-- Body -->
            <div style="color:#d8d3c5;font-size:14px;line-height:1.7;">
                <p style="margin:0 0 16px 0;">
                    <span style="color:#8b8270;">// </span>Hey {first_name},
                </p>
                <p style="margin:0 0 16px 0;">
                    We've reviewed your Pro upgrade request for GitHub account 
                    <span style="color:#d8a657;">@{github_username}</span>, and unfortunately 
                    we're unable to approve it at this time.
                </p>
                <p style="margin:0 0 16px 0;">
                    This could be due to an invalid coupon code, incomplete information, 
                    or other eligibility criteria.
                </p>
                <p style="margin:0 0 8px 0;color:#8b8270;">
                    // What you can do:
                </p>
                <div style="padding-left:16px;margin-bottom:24px;">
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#d8a657;">→</span> Double-check your coupon code and resubmit
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#d8a657;">→</span> Contact us at support@gitmesh.in for assistance
                    </p>
                    <p style="margin:4px 0;color:#d8d3c5;">
                        <span style="color:#d8a657;">→</span> Continue using the free Hobby plan
                    </p>
                </div>

                <!-- CTA Button -->
                <div style="margin:32px 0;">
                    <a href="https://gitmesh.in/pricing" 
                       style="display:inline-block;background:#f3eee1;color:#0e0d0b;padding:12px 24px;text-decoration:none;font-weight:bold;font-size:13px;font-family:'Courier New',monospace;text-transform:uppercase;">
                        View Plans →
                    </a>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="border-top:1px solid #211f19;padding-top:24px;margin-top:32px;">
                <p style="color:#8b8270;font-size:11px;margin:0;">
                    — The GitMesh Team<br>
                    <span style="color:#3a352b;">// This is an automated notification. Do not reply to this email.</span>
                </p>
            </div>
        </div>
    </body>
    </html>
    """


async def send_pro_approval_email(
    to_email: str,
    first_name: str,
    github_username: str,
) -> bool:
    """Send a styled HTML email notifying the user their Pro upgrade was approved."""
    settings = get_settings()
    
    if not settings.ADMIN_EMAIL_ADDRESS or not settings.ADMIN_EMAIL_PASSWORD:
        logger.warning("Email credentials not configured. Skipping approval email.")
        return False
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "🚀 GitMesh Pro — Your Upgrade Has Been Approved!"
    msg["From"] = f"GitMesh <{settings.ADMIN_EMAIL_ADDRESS}>"
    msg["To"] = to_email
    
    plain_text = (
        f"Hey {first_name},\n\n"
        f"Your GitMesh Developer (Pro) subscription has been activated for @{github_username}.\n\n"
        f"You now have access to all Pro features for 1 year.\n\n"
        f"Head to your dashboard: https://gitmesh.in/dashboard\n\n"
        f"— The GitMesh Team"
    )
    
    html_content = _get_approval_html(first_name, github_username)
    
    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_content, "html"))
    
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.ADMIN_EMAIL_ADDRESS, settings.ADMIN_EMAIL_PASSWORD)
        server.send_message(msg)
    
    logger.info("Pro approval email sent to %s", to_email)
    return True


async def send_pro_rejection_email(
    to_email: str,
    first_name: str,
    github_username: str,
) -> bool:
    """Send a styled HTML email notifying the user their Pro request was rejected."""
    settings = get_settings()
    
    if not settings.ADMIN_EMAIL_ADDRESS or not settings.ADMIN_EMAIL_PASSWORD:
        logger.warning("Email credentials not configured. Skipping rejection email.")
        return False
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "GitMesh — Pro Request Update"
    msg["From"] = f"GitMesh <{settings.ADMIN_EMAIL_ADDRESS}>"
    msg["To"] = to_email
    
    plain_text = (
        f"Hey {first_name},\n\n"
        f"We've reviewed your Pro upgrade request for @{github_username}, "
        f"and unfortunately we're unable to approve it at this time.\n\n"
        f"You can resubmit with a valid coupon code or contact support@gitmesh.in.\n\n"
        f"— The GitMesh Team"
    )
    
    html_content = _get_rejection_html(first_name, github_username)
    
    msg.attach(MIMEText(plain_text, "plain"))
    msg.attach(MIMEText(html_content, "html"))
    
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.ADMIN_EMAIL_ADDRESS, settings.ADMIN_EMAIL_PASSWORD)
        server.send_message(msg)
    
    logger.info("Pro rejection email sent to %s", to_email)
    return True
