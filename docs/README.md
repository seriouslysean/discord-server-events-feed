# Discord Server Events Feed

<p align="center">
  <img
    src="./assets/discord-server-events-logo.png"
    alt="Discord Server Events"
    width="50%" />
</p>

Discord doesn’t provide a built-in way to subscribe to server events in external calendars. This project bridges that gap by generating an `.ics` file from your server’s scheduled events, enabling seamless integration with Google Calendar, Apple Calendar, or Outlook.

## Setup

### 1. **Create a Discord Application**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
   - Under the **Bot** tab, create a bot and copy its token. This will be used as `DSE_DISCORD_BOT_TOKEN`.

### 2. **Gather Required IDs**
   - Enable **Developer Mode** in Discord:
     - Go to `Settings > Advanced > Developer Mode` and toggle it on.
   - Right-click your server’s name and select **Copy ID**. This will be your `DSE_DISCORD_GUILD_ID`.
   - Note your application’s **Client ID**, which you’ll use for bot permissions.

### 3. **Set Permissions and Invite the Bot**
   - The bot needs:
     - `View Channels`
     - `Manage Events`
   - Use this URL to invite the bot to your server, replacing `<YOUR_APPLICATION_ID>` with your Client ID:
     ```
     https://discord.com/oauth2/authorize?client_id=<YOUR_APPLICATION_ID>&permissions=1049600&scope=bot
     ```

### 4. **Configure Environment Variables**
   - Copy the provided `.env.example` file to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Edit the `.env` file with your IDs and bot token:
     ```env
     DSE_DISCORD_GUILD_ID=<YOUR_SERVER_ID>
     DSE_DISCORD_APPLICATION_ID=<YOUR_APPLICATION_ID>
     DSE_DISCORD_BOT_TOKEN=<YOUR_BOT_TOKEN>
     ```

### 5. **Install Dependencies and Run**
   - Clone the repository and install dependencies:
     ```bash
     git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
     cd YOUR_REPOSITORY_NAME
     npm install
     ```
   - Run `npm start` to generate the `.ics` file. The `.ics` file will be saved in the `dist` folder.

## Subscribe to Calendar

1. Publish your main branch as a GitHub Page:
   - Go to your repository on GitHub.
   - Click on `Settings`.
   - Scroll down to the `Pages` section.
   - Under `Source`, select `main` branch and `/root` folder.
   - Click `Save`.
   - **Note:** Ensure your repository is public for GitHub Pages to work.

2. Add the ICS file to your calendar app:
   - Use the following URL, replacing `YOUR_GITHUB_USERNAME` and `YOUR_REPOSITORY_NAME` with your GitHub username and repository name:
     ```
     https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/dist/events.ics
     ```

## References

- https://discord.com/developers/docs/intro
- https://en.wikipedia.org/wiki/ICalendar
