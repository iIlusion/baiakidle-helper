import * as React from "react";
import { LeviticusMark } from "./LeviticusMark";
import { DiscordIcon, LEVITICUS_DISCORD_URL } from "./DiscordLink";

export const LEVITICUS_SITE_URL = "https://leviticusbot.com";
const BAIAKIDLE_MARK_URL = "./brand/icon-gold.svg";

function CloseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

function ExternalLinkIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8" />
      <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function AnnouncementModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="lev-announcement-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="lev-announcement-modal" role="dialog" aria-modal="true" aria-labelledby="lev-announcement-title">
        <button className="lev-announcement-close" type="button" onClick={onClose} aria-label="Fechar aviso"><CloseIcon /></button>
        <header className="lev-announcement-header">
          <div className="lev-announcement-eyebrow">
            <span>UMA NOVA FASE</span>
            <span>ECOSSISTEMA LEVITICUS</span>
          </div>
          <div className="lev-announcement-brand-strip" data-testid="lev-announcement-brand-strip" aria-label="BaiakIdle e Leviticus">
            <div className="lev-announcement-brand lev-announcement-brand-baiak">
              <div className="lev-announcement-brand-icon lev-announcement-brand-icon-baiak">
                <img src={BAIAKIDLE_MARK_URL} alt="BaiakIdle" />
              </div>
              <div className="lev-announcement-brand-name">
                <strong>BAIAK</strong>
                <span>IDLE</span>
              </div>
            </div>
            <span className="lev-announcement-brand-link" aria-hidden="true">×</span>
            <div className="lev-announcement-brand lev-announcement-brand-leviticus" data-testid="lev-announcement-leviticus-mark">
              <div className="lev-announcement-brand-icon lev-announcement-brand-icon-leviticus" aria-hidden="true"><LeviticusMark /></div>
              <div className="lev-announcement-brand-name">
                <strong>LEVITICUS</strong>
                <span>EXTENSION</span>
              </div>
            </div>
          </div>
        </header>
        <div className="lev-announcement-content">
          <div className="lev-announcement-mark" aria-hidden="true"><LeviticusMark /></div>
          <h2 id="lev-announcement-title">Leviticus Extension</h2>
          <p className="lev-announcement-lead">O Baiakidle Helper agora se chama Leviticus Extension. A extensão faz parte do ecossistema Leviticus, com automações para jogos idle.</p>
          <p className="lev-announcement-support">Quer conhecer os bots do BaiakIdle e do Huntera? Acesse o site ou entre no Discord para acompanhar as novidades.</p>
          <div className="lev-announcement-actions">
            <a className="lev-announcement-action lev-announcement-action-site" href={LEVITICUS_SITE_URL} target="_blank" rel="noreferrer" onClick={onClose}>
              <span className="lev-announcement-action-icon"><ExternalLinkIcon /></span>
              <span className="lev-announcement-action-copy"><strong>Conhecer o site</strong><small>leviticusbot.com</small></span>
              <span className="lev-announcement-action-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="lev-announcement-action lev-announcement-action-discord" href={LEVITICUS_DISCORD_URL} target="_blank" rel="noreferrer" onClick={onClose}>
              <span className="lev-announcement-action-icon"><DiscordIcon /></span>
              <span className="lev-announcement-action-copy"><strong>Entrar no Discord</strong><small>discord.leviticusbot.com</small></span>
              <span className="lev-announcement-action-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="lev-announcement-footer"><span>BaiakIdle · Huntera</span><span>Leviticus Extension</span></div>
        </div>
      </section>
    </div>
  );
}
