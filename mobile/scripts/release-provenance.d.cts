declare const provenance: {
  read(expectedApiUrl: string | undefined): {
    sourceCommit: string;
    sourceFingerprint: string;
    version: string;
    build: number;
    apiUrl: string;
  };
};
export = provenance;
