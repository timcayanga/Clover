export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <div className="legal-page__inner">
        <header className="legal-page__header">
          <span className="legal-page__eyebrow">Clover</span>
          <h1>Privacy Policy</h1>
          <p>Last updated: April 20, 2026</p>
          <p>
            This policy explains what information Clover collects, how we use it, and the choices you have when you use the app.
          </p>
        </header>

        <section className="legal-page__section">
          <h2>Information we collect</h2>
          <ul>
            <li>Account details such as your name, email address, and authentication data.</li>
            <li>Statement files, uploads, and transaction data you choose to import.</li>
            <li>Usage data, device data, and diagnostic information that help us keep Clover reliable.</li>
            <li>Messages or support requests you send us.</li>
          </ul>
        </section>

        <section className="legal-page__section">
          <h2>How we use information</h2>
          <ul>
            <li>To create and manage your account.</li>
            <li>To process uploaded statements, generate reports, and surface AI insights.</li>
            <li>To improve the app, troubleshoot issues, and secure our systems.</li>
            <li>To respond to support requests and send important service updates.</li>
          </ul>
        </section>

        <section className="legal-page__section">
          <h2>How we share information</h2>
          <p>
            We do not sell your personal information. We may share data with trusted service providers that help us run the app, such as hosting,
            authentication, analytics, and error monitoring providers. We may also share information if required by law or to protect Clover and its
            users.
          </p>
        </section>

        <section className="legal-page__section">
          <h2>Data retention and security</h2>
          <p>
            We keep your information only as long as needed to provide the service, comply with legal obligations, resolve disputes, and maintain
            records. We use administrative, technical, and organizational safeguards designed to protect your data, but no system can be completely
            secure.
          </p>
        </section>

        <section className="legal-page__section">
          <h2>Your choices</h2>
          <ul>
            <li>You can update or delete your account information where the product allows it.</li>
            <li>You can request access, correction, or deletion of your data by contacting us.</li>
            <li>You can stop using the app at any time.</li>
          </ul>
        </section>

        <section className="legal-page__note">
          Clover is a financial insights tool, not a bank or a financial advisor. Please review this policy with counsel before launch.
        </section>
      </div>
    </main>
  );
}
