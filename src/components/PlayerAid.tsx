import React, { useState } from 'react';
import { CREW_COMPOSITION_TABLE, getNavigationDeckInfo } from '../engine/rules';
import type { VoyageMode } from '../engine/types';
import { useI18n } from '../i18n/I18nContext';
import {
  CabinSearchHexIcon,
  CultistIcon,
  CultLeaderIcon,
  CutTongueHexIcon,
  FeedKrakenHexIcon,
  FloggingHexIcon,
  NavArmingIcon,
  NavCultUprisingIcon,
  NavDisarmIcon,
  NavDrunkIcon,
  NavMermaidIcon,
  NavTelescopeIcon,
  PirateIcon,
  RitualIcon,
  SailorIcon,
} from './icons/GameIcons';

interface PlayerAidProps {
  activePlayerCount?: number;
  defaultVoyageMode?: VoyageMode;
}

type AidSection = 'victory' | 'round' | 'nav' | 'rituals' | 'map';

export const PlayerAid: React.FC<PlayerAidProps> = ({
  activePlayerCount,
  defaultVoyageMode = 'short',
}) => {
  const { t } = useI18n();
  const [section, setSection] = useState<AidSection>('victory');
  const [deckMode, setDeckMode] = useState<VoyageMode>(defaultVoyageMode);

  const deck = getNavigationDeckInfo(deckMode);

  return (
    <div>
      <div className="crimson-ribbon">
        <h2>{t('aidTitle')}</h2>
      </div>

      <div className="pill-tabs" role="tablist">
        <button
          type="button"
          className={section === 'victory' ? 'active' : ''}
          onClick={() => setSection('victory')}
        >
          {t('aidSecVictory')}
        </button>
        <button
          type="button"
          className={section === 'round' ? 'active' : ''}
          onClick={() => setSection('round')}
        >
          {t('aidSecRound')}
        </button>
        <button
          type="button"
          className={section === 'nav' ? 'active' : ''}
          onClick={() => setSection('nav')}
        >
          {t('aidSecNavCards')}
        </button>
        <button
          type="button"
          className={section === 'rituals' ? 'active' : ''}
          onClick={() => setSection('rituals')}
        >
          {t('aidSecRituals')}
        </button>
        <button
          type="button"
          className={section === 'map' ? 'active' : ''}
          onClick={() => setSection('map')}
        >
          {t('aidSecMapActions')}
        </button>
      </div>

      {section === 'victory' && (
        <>
          <div className="parchment-card">
            <div className="aid-item">
              <SailorIcon size={44} />
              <div>
                <h4>{t('factionGroupSailor')}</h4>
                <p>{t('winSailor')}</p>
              </div>
            </div>
            <div className="aid-item">
              <PirateIcon size={44} />
              <div>
                <h4>{t('factionGroupPirate')}</h4>
                <p>{t('winPirate')}</p>
              </div>
            </div>
            <div className="aid-item">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <CultLeaderIcon size={36} />
                <CultistIcon size={36} />
              </div>
              <div>
                <h4>{t('factionGroupCult')}</h4>
                <p>{t('winCult')}</p>
              </div>
            </div>
          </div>

          <div className="parchment-card">
            <table className="aid-table">
              <thead>
                <tr>
                  <th>{t('aidTablePlayers')}</th>
                  <th>{t('aidTableSailors')}</th>
                  <th>{t('aidTablePirates')}</th>
                  <th>{t('aidTableLeader')}</th>
                  <th>{t('aidTableCultist')}</th>
                  <th>{t('aidTableOffDuty')}</th>
                  <th>{t('aidTableMutiny')}</th>
                </tr>
              </thead>
              <tbody>
                {CREW_COMPOSITION_TABLE.map((row) => (
                  <tr
                    key={row.players}
                    className={activePlayerCount === row.players ? 'highlight-row' : ''}
                  >
                    <td>
                      <strong>{row.players}</strong>
                    </td>
                    <td>{row.sailors}</td>
                    <td>{row.pirates}</td>
                    <td>{row.cultLeader}</td>
                    <td>{row.cultist || '—'}</td>
                    <td>{row.offDuty}</td>
                    <td>{row.mutinyGuns}+</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="notice-box gold small-text">{t('aidRule5p')}</div>
            <div className="notice-box cult small-text">{t('aidRule11p')}</div>
          </div>
        </>
      )}

      {section === 'round' && (
        <div className="parchment-card stack-sm">
          <div>
            <h3 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-display)' }}>
              {t('aidNavOrderTitle')}
            </h3>
            <p className="small-text" style={{ margin: '0.25rem 0' }}>{t('aidNavStep1')}</p>
            <p className="small-text" style={{ margin: '0.25rem 0' }}>{t('aidNavStep2')}</p>
            <p className="small-text" style={{ margin: '0.25rem 0' }}>{t('aidNavStep3')}</p>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--parchment-border)', margin: '0.4rem 0' }} />
          <div>
            <h3 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-display)' }}>
              {t('aidMutinyTitle')}
            </h3>
            <p className="small-text" style={{ margin: 0, lineHeight: 1.45 }}>
              {t('aidMutinyDesc')}
            </p>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--parchment-border)', margin: '0.4rem 0' }} />
          <div>
            <h3 style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-display)' }}>
              {t('aidOverboardTitle')}
            </h3>
            <p className="small-text" style={{ margin: 0, lineHeight: 1.45 }}>
              {t('aidOverboardDesc')}
            </p>
          </div>
        </div>
      )}

      {section === 'nav' && (
        <div className="parchment-card">
          <div className="pill-tabs">
            <button
              type="button"
              className={deckMode === 'short' ? 'active' : ''}
              onClick={() => setDeckMode('short')}
            >
              {t('aidDeckToggleShort')}
            </button>
            <button
              type="button"
              className={deckMode === 'long' ? 'active' : ''}
              onClick={() => setDeckMode('long')}
            >
              {t('aidDeckToggleLong')}
            </button>
          </div>

          <div className="aid-item">
            <NavDrunkIcon size={40} />
            <div>
              <h4>
                {t('aidIconDrunk')}{' '}
                <span className="badge badge-faction-sailor">{deck.blue.drunk}×</span>{' '}
                <span className="badge badge-faction-pirate">{deck.red.drunk}×</span>
              </h4>
              <p>{t('aidIconDrunkDesc')}</p>
            </div>
          </div>

          <div className="aid-item">
            <NavMermaidIcon size={40} />
            <div>
              <h4>
                {t('aidIconMermaid')}{' '}
                <span className="badge badge-faction-pirate">{deck.red.mermaid}×</span>
              </h4>
              <p>{t('aidIconMermaidDesc')}</p>
            </div>
          </div>

          <div className="aid-item">
            <NavTelescopeIcon size={40} />
            <div>
              <h4>
                {t('aidIconTelescope')}{' '}
                <span className="badge badge-faction-pirate">{deck.red.telescope}×</span>
              </h4>
              <p>{t('aidIconTelescopeDesc')}</p>
            </div>
          </div>

          <div className="aid-item">
            <NavArmingIcon size={40} />
            <div>
              <h4>
                {t('aidIconArming')}{' '}
                <span className="badge badge-faction-pirate">
                  {deck.red.arming > 0 ? `${deck.red.arming}×` : '0×'}
                </span>
              </h4>
              <p>{t('aidIconArmingDesc')}</p>
            </div>
          </div>

          <div className="aid-item">
            <NavDisarmIcon size={40} />
            <div>
              <h4>
                {t('aidIconDisarm')}{' '}
                <span className="badge badge-faction-sailor">{deck.blue.disarm}×</span>
              </h4>
              <p>{t('aidIconDisarmDesc')}</p>
            </div>
          </div>

          <div className="aid-item">
            <NavCultUprisingIcon size={40} />
            <div>
              <h4>
                {t('aidIconCultUprising')}{' '}
                <span className="badge badge-faction-cult_leader">{deck.yellow.cultUprising}×</span>
              </h4>
              <p>{t('aidIconCultUprisingDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {section === 'rituals' && (
        <div className="parchment-card">
          <div className="aid-item">
            <RitualIcon ritual="conversion" size={46} />
            <div>
              <h4>
                {t('ritualConversion')} <span className="badge badge-faction-cultist">3×</span>
              </h4>
              <p>{t('aidRitualConvDesc')}</p>
            </div>
          </div>
          <div className="aid-item">
            <RitualIcon ritual="gun_stash" size={46} />
            <div>
              <h4>
                {t('ritualGunStash')} <span className="badge badge-faction-cult_leader">1×</span>
              </h4>
              <p>{t('aidRitualGunDesc')}</p>
            </div>
          </div>
          <div className="aid-item">
            <RitualIcon ritual="enlightenment" size={46} />
            <div>
              <h4>
                {t('ritualEnlightenment')}{' '}
                <span className="badge badge-faction-cult_leader">1×</span>
              </h4>
              <p>{t('aidRitualEnlDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {section === 'map' && (
        <div className="parchment-card">
          <div className="aid-item">
            <CabinSearchHexIcon size={46} />
            <div>
              <h4>
                {t('actionCabinSearch')}{' '}
                <span className="badge badge-searched">{deck.mapActions.cabinSearch}×</span>
              </h4>
              <p>{t('aidMapCabinDesc')}</p>
            </div>
          </div>
          <div className="aid-item">
            <CutTongueHexIcon size={46} />
            <div>
              <h4>
                {t('actionCutTongue')}{' '}
                <span className="badge badge-tongue">{deck.mapActions.cutTongue}×</span>
              </h4>
              <p>{t('aidMapTongueDesc')}</p>
            </div>
          </div>
          <div className="aid-item">
            <FloggingHexIcon size={46} />
            <div>
              <h4>
                {t('actionFlogging')}{' '}
                <span className="badge badge-flogged">{deck.mapActions.flogging}×</span>
              </h4>
              <p>{t('aidMapFlogDesc')}</p>
            </div>
          </div>
          <div className="aid-item">
            <FeedKrakenHexIcon size={46} />
            <div>
              <h4>
                {t('actionFeedKraken')}{' '}
                <span className="badge badge-eliminated">{deck.mapActions.feedKraken}×</span>
              </h4>
              <p>{t('aidMapKrakenDesc')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
