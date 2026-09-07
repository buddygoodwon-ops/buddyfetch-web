# whoagenticAIwhat.com - Development Site

## Purpose
This is the **development/testing environment** for BuddyFetch.AI. All code changes, tests, and experiments should be conducted here FIRST before deploying to the production site (www.buddyfetch.ai).

## Safety Protocol
- ✅ **Production site (www.buddyfetch.ai) is protected** - no changes made here
- ✅ **All development work happens on this site**
- ✅ **When testing is complete, changes can be safely deployed to production**

## Current Status
- **LiveKit Integration**: Native LiveKit client SDK via CDN
- **Token Generation**: Serverless function at `/api/token`
- **Avatar Flow**: Click → Microphone → LiveKit Room → Greeting
- **Security**: API keys server-side only

## Testing Instructions
1. Visit the site
2. Click the dog avatar
3. Allow microphone access
4. Listen for "WOOF Roof!!!" greeting
5. Check browser console for connection logs

## Deployment
When ready to deploy to production:
1. Test all functionality on this development site
2. Run `npx vercel --prod --cwd <production-path>`
3. Monitor for errors

---
*This site is a mirror of BuddyFetch.AI for safe development and testing.*