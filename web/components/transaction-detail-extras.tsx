"use client";
import { useRef, useState, type ReactNode } from 'react';
import { useDefaultCurrency } from '@/lib/use-default-currency';
import { useExchangeRates } from '@/lib/use-exchange-rates';
import { formatCurrencyAmount } from '@/lib/currency-format';
import { quickLineItem, transactionConvertedAmount, type QuickLineItem } from '../../shared/transaction-detail-extras';
import styles from './transaction-detail-extras.module.css';

export function TransactionConversion({ amount, currency, renderAmount }: { amount: string; currency: string; renderAmount?: (value: string, currency: string) => ReactNode }) {
  const target = useDefaultCurrency();
  const differs = Boolean(currency && target && currency !== target);
  const fx = useExchangeRates([currency], target, differs);
  const converted = transactionConvertedAmount(amount, currency, target, fx.rates);
  if (!differs) return null;
  return <div className={styles.conversion} aria-label="Default currency estimate">
    <span>Estimated in {target}</span>
    <strong aria-live="polite">{converted !== null ? (renderAmount?.(formatCurrencyAmount(converted, target), target) ?? formatCurrencyAmount(converted, target)) : fx.loading ? 'Converting…' : 'Conversion unavailable'}</strong>
    {converted !== null ? <small>Indicative exchange rate{fx.asOf ? ` · ${fx.asOf}` : ''}</small> : !fx.loading ? <button className={styles.link} type="button" onClick={fx.retry}>Retry conversion</button> : null}
  </div>;
}

export function QuickAddLineItem({ currency, count, disabled = false, onAdd }: { currency: string; count: number; disabled?: boolean; onAdd: (item: QuickLineItem, requestId: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [amount, setAmount] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const submit = async () => {
    if (lock.current || disabled) return;
    setError('');
    try {
      const item = quickLineItem(name, amount, currency, count);
      lock.current = true; setBusy(true);
      const key = JSON.stringify(item);
      if (pending.current?.key !== key) pending.current = {key, id: crypto.randomUUID()};
      await onAdd(item, pending.current.id);
      pending.current = null;
      setName(''); setAmount(''); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add line item. Please retry.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={styles.add}>
    {open ? <div className={styles.row}>
      <button className={styles.plus} type="button" aria-label="Confirm new line item" disabled={disabled || busy || count >= 100} onClick={() => void submit()}>{busy ? '…' : '+'}</button>
      <input autoFocus aria-label="New line item name" placeholder="Name" maxLength={500} value={name} disabled={disabled || busy} onChange={e => setName(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') {e.preventDefault(); void submit();} }} />
      <input aria-label={`New line item amount (${currency})`} placeholder="Amount" inputMode="decimal" maxLength={32} value={amount} disabled={disabled || busy} onChange={e => setAmount(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') {e.preventDefault(); void submit();} }} />
    </div> : null}
    <button className={styles.link} type="button" aria-expanded={open} disabled={disabled || busy || (!open && count >= 100)} onClick={() => { setOpen(v => !v); setError(''); }}>{open ? 'Cancel' : '+ Add Line Item'}</button>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}

export function TransactionLineItemRow({ description, amount }: { description: string; amount: ReactNode }) {
  return <div className={styles.lineItem}><span>{description}</span><strong>{amount}</strong></div>;
}
