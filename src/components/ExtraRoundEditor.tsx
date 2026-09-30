import { useEffect, useId, useState } from 'react';
import type { ExtraRound } from '../domain/types';
import { Icon } from './Icon';
import { Popover, usePopover } from './Popover';

export function extraRoundText(extra: ExtraRound | null): string {
  if (!extra) return 'Not offered';
  return `+${extra.days} ${extra.days === 1 ? 'day' : 'days'}, ${extra.fee.trim() || 'set a fee'}`;
}

export function ExtraRoundEditor({ extra, onChange, disabled }: { extra: ExtraRound | null; onChange: (extra: ExtraRound | null) => void; disabled?: boolean }) {
  const pop = usePopover();
  const daysId = useId();
  const feeId = useId();
  const [days, setDays] = useState(extra?.days ?? 2);
  const [fee, setFee] = useState(extra?.fee ?? '');

  useEffect(() => {
    if (pop.open) {
      setDays(extra?.days ?? 2);
      setFee(extra?.fee ?? '');
    }
  }, [pop.open, extra]);

  return (
    <>
      <button
        type="button"
        className={`value-btn${extra && !extra.fee.trim() ? ' is-placeholder' : ''}`}
        aria-label={`Extra round: ${extraRoundText(extra)}, change`}
        disabled={disabled}
        {...pop.triggerProps}
      >
        {extraRoundText(extra)}
        {!disabled && <Icon name="chevronDown" size={12} strokeWidth={2.2} />}
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} id={pop.id} label="Extra round" placement="bottom-end" width={280} className="form-pop">
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ days, fee: fee.trim() });
            pop.close(true);
          }}
        >
          <p className="form-help">If the client runs out of revisions, they can buy one more round.</p>
          <label htmlFor={daysId}>Adds to the timeline</label>
          <select id={daysId} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 7].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
          <label htmlFor={feeId}>Fee</label>
          <input id={feeId} type="text" value={fee} placeholder="e.g. ₹8,000" onChange={(e) => setFee(e.target.value)} autoComplete="off" />
          <div className="form-actions">
            {extra && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  onChange(null);
                  pop.close(true);
                }}
              >
                Stop offering
              </button>
            )}
            <button type="submit" className="btn btn-sm btn-dark">
              {extra ? 'Save' : 'Offer extra round'}
            </button>
          </div>
        </form>
      </Popover>
    </>
  );
}
