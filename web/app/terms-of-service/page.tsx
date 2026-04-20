export default function TermsOfServicePage() {
  return (
    <main className="legal-page">
      <div className="legal-page__inner">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Clover</span>
          <h1>Terms of Service</h1>
          <p>Last updated: April 20, 2026</p>
          <p>
            These terms govern your use of Clover and explain your responsibilities when you access the app and its features.
          </p>
        </header>

        <section className="legal-page__section">
          <h2>Acceptance of these terms</h2>
          <p>
            By using Clover, you agree to these terms. If you do not agree, do not use the app.
          </p>
        </section>

        <section className="legal-page__section">
          <h2>Your account</h2>
          <ul>
            <li>You are responsible for the accuracy of the information you provide.</li>
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>You must notify us if you suspect unauthorized access to your account.</li>
          </ul>
        </section>

        <section className="legal-page__section">
          <h2>Acceptable use</h2>
          <ul>
            <li>Do not upload unlawful, harmful, or misleading content.</li>
            <li>Do not attempt to disrupt, reverse engineer, or abuse the service.</li>
            <li>Use Clover only for lawful personal finance purposes.</li>
          </ul>
        </section>

        <section className="legal-page__section">
          <h2>Service and content</h2>
          <p>
            Clover may change, update, or discontinue features at any time. Reports and AI insights are provided for informational purposes only and
            should not be treated as financial, legal, or tax advice.
          </p>
        </section>

        <section className="legal-page__section">
          <h2>Ownership</h2>
          <p>
            Clover and its branding, software, and content are owned by us or our licensors. You retain rights to the content you upload, subject to
            the permissions needed for us to process and display it inside the app.
          </p>
        </section>

        <section className="legal-page__section">
          <h2>Termination</h2>
          <p>
            We may suspend or terminate access if we believe you have violated these terms, created risk for the service, or used Clover in a way
            that harms other users or the platform.
          </p>
        </section>

        <section className="legal-page__note">
          These are starter terms for launch review and should be finalized with legal counsel before going live.
        </section>
      </div>
    </main>
  );
}
