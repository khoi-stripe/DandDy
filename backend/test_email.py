"""Quick Postmark email test - run with: python test_email.py"""
import os
from dotenv import load_dotenv
import httpx

load_dotenv()

token = os.getenv('POSTMARK_SERVER_TOKEN')
email_from = os.getenv('EMAIL_FROM')

# ✏️ EDIT THIS: Your test recipient email
# Note: While in test mode, recipient must be @danddy.app
TO_EMAIL = 'no-reply@danddy.app'

resp = httpx.post('https://api.postmarkapp.com/email', 
    json={
        'From': email_from,
        'To': TO_EMAIL,
        'Subject': 'DandDy Test Email',
        'TextBody': 'If you received this, Postmark is working!',
        'HtmlBody': '<h2>DandDy</h2><p>If you received this, <strong>Postmark is working!</strong></p>',
        'MessageStream': 'outbound',
    },
    headers={'X-Postmark-Server-Token': token, 'Content-Type': 'application/json'},
    timeout=10.0
)

print(f'Status: {resp.status_code}')
if resp.status_code == 200:
    print('✅ Email sent! Check your inbox.')
else:
    print(f'❌ Error: {resp.text}')
