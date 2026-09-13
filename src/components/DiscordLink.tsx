import * as React from "react";

export const LEVITICUS_DISCORD_URL = "https://discord.leviticusbot.com";

export function DiscordIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37A19.79 19.79 0 0 0 16.057 3c-.2.36-.43.84-.59 1.22a18.27 18.27 0 0 0-6.94 0A12.64 12.64 0 0 0 7.94 3a19.74 19.74 0 0 0-4.26 1.37C.98 8.45.25 12.42.61 16.33a19.9 19.9 0 0 0 5.18 2.63c.42-.58.79-1.2 1.11-1.85-.61-.23-1.2-.51-1.76-.84.15-.11.3-.22.44-.33 3.4 1.58 7.08 1.58 10.44 0 .15.11.3.22.44.33-.56.33-1.15.61-1.76.84.32.65.69 1.27 1.11 1.85a19.9 19.9 0 0 0 5.18-2.63c.42-4.58-.71-8.51-2.85-11.96ZM8.68 14.81c-1.02 0-1.86-.94-1.86-2.1s.82-2.1 1.86-2.1 1.87.94 1.86 2.1c0 1.16-.82 2.1-1.86 2.1Zm6.64 0c-1.02 0-1.86-.94-1.86-2.1s.82-2.1 1.86-2.1 1.87.94 1.86 2.1c0 1.16-.82 2.1-1.86 2.1Z" />
    </svg>
  );
}

export function DiscordLink({ href = LEVITICUS_DISCORD_URL }: { href?: string }): React.JSX.Element {
  return (
    <a
      className="baiak-discord-link"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Abrir Discord do Leviticus"
      title="Discord do Leviticus"
    >
      <DiscordIcon />
      <span>Discord</span>
    </a>
  );
}
