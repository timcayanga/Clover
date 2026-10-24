"use client";

import { useEffect, useRef, useState } from "react";
import { paymentMessageLink } from "../../shared/payment-request-links";

type Contact = { name?: string[]; tel?: string[]; email?: string[] };
type ContactNavigator = Navigator & { contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<Contact[]> } };

export function PaymentRequestShareDialog({ message, email, onClose }: { message: string; email: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [canPick, setCanPick] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setCanPick(typeof (navigator as ContactNavigator).contacts?.select === "function");
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (message) {
      setContact(null); setPhone(""); setAddress(email); setNotice("");
      if (node && !node.open) node.showModal();
    } else {
      setContact(null); setPhone(""); setAddress(""); setNotice("");
      if (node?.open) node.close();
    }
  }, [message, email]);
  const pick = async () => {
    try {
      const contacts = (navigator as ContactNavigator).contacts;
      if (!contacts) return;
      const [selected] = await contacts.select(["name", "tel", "email"], { multiple: false });
      if (!selected) return;
      setContact(selected); setPhone(selected.tel?.[0] ?? ""); setAddress(selected.email?.[0] ?? "");
      setNotice("Contact selected. Review the recipient, then open a message or email. Nothing has been sent.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice("Contacts could not open. Enter a phone number or email, or choose a messaging app.");
    }
  };
  const share = async () => {
    try {
      if (typeof navigator.share !== "function") {
        setNotice("Choose a phone number or email below, or copy the message into your conversation.");
        return;
      }
      await navigator.share({ title: "Your shared bills", text: message });
      setNotice("Share sheet closed. Check your chosen app to confirm the message was sent.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice("Sharing could not open. Use a message, email, or copy the text instead.");
    }
  };
  const sms = paymentMessageLink("sms", phone, message, ios);
  const mail = paymentMessageLink("email", address, message);
  return <dialog ref={dialog} className="split-request-share-dialog" aria-labelledby="payment-share-title" onCancel={onClose} onClose={onClose}>
    <h2 id="payment-share-title">Your request is ready</h2>
    <p>Choose who to send it to. Nothing has been sent yet.</p>
    <pre>{message}</pre>
    {canPick ? <button type="button" className="button button-secondary" onClick={() => void pick()}>Choose phone contact</button> : null}
    {contact?.name?.[0] ? <p>Selected contact: {contact.name[0]}</p> : null}
    <label>Phone number
      {contact?.tel && contact.tel.length > 1 ? <select className="settings-input" aria-label="Contact phone number" value={phone} onChange={e => setPhone(e.target.value)}>{contact.tel.map((tel, i) => <option key={i}>{tel}</option>)}</select> : <input className="settings-input" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter a phone number" />}
    </label>
    {sms ? <a className="button button-secondary" href={sms}>Open text message</a> : null}
    <label>Email
      {contact?.email && contact.email.length > 1 ? <select className="settings-input" aria-label="Contact email" value={address} onChange={e => setAddress(e.target.value)}>{contact.email.map((entry, i) => <option key={i}>{entry}</option>)}</select> : <input className="settings-input" type="email" autoComplete="email" value={address} onChange={e => setAddress(e.target.value)} placeholder="Enter an email address" />}
    </label>
    {mail ? <a className="button button-secondary" href={mail}>Open email</a> : null}
    <button type="button" className="button button-primary" onClick={() => void share()}>Choose messaging app</button>
    <button type="button" className="button button-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(message); setNotice("Message copied. Paste it into your conversation."); }
      catch { setNotice("Select and copy the message above."); }
    }}>Copy message</button>
    {notice ? <p role="status">{notice}</p> : null}
    <button type="button" className="button button-secondary" onClick={onClose}>Close</button>
  </dialog>;
}
