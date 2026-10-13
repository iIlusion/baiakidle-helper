import * as React from "react";
import { LeviticusMark } from "./LeviticusMark";
import { DiscordIcon, LEVITICUS_DISCORD_URL } from "./DiscordLink";

export const LEVITICUS_SITE_URL = "https://www.leviticusbot.com/?camp=p2CBR4cb";

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

function AccountsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="3" y="13" width="8" height="7" rx="1.5" />
      <rect x="13" y="13" width="8" height="7" rx="1.5" />
    </svg>
  );
}

function PowerIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 3v8" />
      <path d="M6.3 7.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

function PhoneIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

const FEATURES = [
  { icon: <AccountsIcon />, title: "Multi-conta num desk só", copy: "Todas as suas contas rodando juntas, cada uma com conexão dedicada." },
  { icon: <PowerIcon />, title: "Desligue o computador", copy: "Roda na nuvem: seu PC dorme, suas contas não." },
  { icon: <PhoneIcon />, title: "Controle pelo celular", copy: "Opere tudo pelo navegador do computador ou pelo celular." }
];

export function AnnouncementModal({ onClose, onHide }: { onClose: () => void; onHide: () => void }): React.JSX.Element {
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
          <div className="lev-announcement-brand" data-testid="lev-announcement-leviticus-mark">
            <div className="lev-announcement-brand-icon" aria-hidden="true"><LeviticusMark /></div>
            <div className="lev-announcement-brand-name">
              <strong>LEVITICUS</strong>
              <span>CLOUD</span>
            </div>
          </div>
          <div className="lev-announcement-eyebrow">AGORA NA NUVEM</div>
        </header>
        <div className="lev-announcement-content">
          <h2 id="lev-announcement-title">Leviticus Cloud</h2>
          <p className="lev-announcement-lead">Suas contas caçam, vendem e juntam o loot 24h por dia. Liga hoje à noite, acorda com o loot feito.</p>

          <ul className="lev-announcement-features">
            {FEATURES.map(feature => (
              <li key={feature.title}>
                <span className="lev-announcement-feature-icon">{feature.icon}</span>
                <span className="lev-announcement-feature-copy"><strong>{feature.title}</strong><small>{feature.copy}</small></span>
              </li>
            ))}
          </ul>

          <div className="lev-announcement-plans" data-testid="lev-announcement-plans">
            <div className="lev-announcement-plan">
              <span className="lev-announcement-price"><b>R$ 75</b><i>/mês</i></span>
              <span className="lev-announcement-plan-limit">até 10 contas</span>
            </div>
            <div className="lev-announcement-plan lev-announcement-plan-best">
              <span className="lev-announcement-price"><b>R$ 99</b><i>/mês</i></span>
              <span className="lev-announcement-plan-limit">até 20 contas</span>
            </div>
          </div>
          <div className="lev-announcement-extra">+ <b>R$ 5</b> por conta extra · assine quantas quiser</div>

          <div className="lev-announcement-actions">
            <a className="lev-announcement-action lev-announcement-action-site" href={LEVITICUS_SITE_URL} target="_blank" rel="noreferrer" onClick={onClose}>
              <span className="lev-announcement-action-icon"><ExternalLinkIcon /></span>
              <span className="lev-announcement-action-copy"><strong>Conhecer o site</strong><small>teste grátis · 24h · 1 conta · leviticusbot.com</small></span>
              <span className="lev-announcement-action-arrow" aria-hidden="true">↗</span>
            </a>
            <a className="lev-announcement-action lev-announcement-action-discord" href={LEVITICUS_DISCORD_URL} target="_blank" rel="noreferrer" onClick={onClose}>
              <span className="lev-announcement-action-icon"><DiscordIcon /></span>
              <span className="lev-announcement-action-copy"><strong>Entrar no Discord</strong><small>discord.leviticusbot.com</small></span>
              <span className="lev-announcement-action-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="lev-announcement-footer"><span>Projeto independente · sem vínculo oficial com BaiakIdle</span><button type="button" className="lev-announcement-hide" onClick={onHide}>Não mostrar novamente</button></div>
        </div>
      </section>
    </div>
  );
}
