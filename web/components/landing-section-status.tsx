import styles from "./landing-section-status.module.css";
export function LandingSectionStatus({ index, total, label }: { index: number; total: number; label: string }) {
  return <div className={styles.status} aria-label={`Section ${index + 1} of ${total}: ${label}`}>
    <span key={index} className={styles.label}><b>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</b> {label}</span>
    <span className={styles.track} aria-hidden="true"><i style={{ width: `${((index + 1) / total) * 100}%` }} /></span>
  </div>;
}
