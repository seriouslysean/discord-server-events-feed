# Discord Server Events Feed

A simple utility to generate an ICS calendar feed from Discord server scheduled events.

## Features

- Fetches scheduled events from a Discord server via the Discord API
- Generates a standard ICS file compatible with most calendar apps
- Handles recurring events with exceptions
- Deploys automatically to GitHub Pages

## Setup

### Prerequisites

- Node.js 22+
- A Discord bot with access to your server
- GitHub repository with Pages enabled

### Discord Bot Setup

1. Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a bot for your application
3. Enable the `SERVER MEMBERS INTENT` under Bot settings (if needed)
4. Invite the bot to your server with the `View Channels` permission
5. Copy the bot token, application ID, and your server's guild ID

### Environment Variables

Create a `.env` file for local development:

```env
DSE_DISCORD_GUILD_ID=your_guild_id
DSE_DISCORD_APPLICATION_ID=your_application_id
DSE_DISCORD_BOT_TOKEN=your_bot_token
DSE_DISCORD_CALENDAR_HEX_COLOR=#6D87BE  # Optional, defaults to Discord blurple
```

For GitHub Actions, add these as repository secrets.

### Local Development

```bash
# Install dependencies
npm install

# Generate the feed locally
npm start

# Run tests
npm test

# Type check
npm run type-check

# Lint
npm run lint
```

### GitHub Pages Deployment

1. Fork or clone this repository
2. Add your Discord secrets to repository settings
3. Enable GitHub Pages with "GitHub Actions" as the source
4. The workflow runs automatically on Monday and Thursday at midnight UTC
5. Manually trigger via Actions → Generate Feed → Run workflow

## Usage

Once deployed, your calendar feed will be available at:

```
https://<username>.github.io/<repo-name>/events.ics
```

Add this URL to your calendar app as a subscription to automatically sync Discord events.

## Project Structure

```
src/
├── config.ts       # Centralized configuration
├── types.ts        # TypeScript type definitions
├── index.ts        # Main entry point
├── public/         # Static assets for GitHub Pages
│   └── index.html  # Landing page with copy-able feed URL
└── utils/
    ├── discord.ts  # Discord API client
    ├── ics.ts      # ICS file generation
    └── logger.ts   # Logging utility
```

## License

MIT
