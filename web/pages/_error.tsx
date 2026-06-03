import type { NextPageContext } from "next";

type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode = 500 }: ErrorPageProps) {
  return (
    <main className="error-screen">
      <div className="error-screen__card glass">
        <p className="eyebrow">Something broke</p>
        <h1>{statusCode === 404 ? "Page not found." : "We hit an unexpected error."}</h1>
        <p>{statusCode === 404 ? "This page does not exist." : "Please try again in a moment."}</p>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 500,
});
