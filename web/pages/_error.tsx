import type { NextPageContext } from "next";
import { ErrorRecoveryScreen } from "@/components/error-recovery-screen";

type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode = 500 }: ErrorPageProps) {
  return <ErrorRecoveryScreen errorCode={`CLV-HTTP-${statusCode}`} recoveryHref="/" recoveryLabel="Go to Landing Page" />;
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 500,
});
