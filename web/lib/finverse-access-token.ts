import { prisma } from "./prisma";
import { getFinverseConfig, decryptFinverseToken, refreshFinverseToken, encryptFinverseToken } from "./finverse";
export const getActiveFinverseToken = async (connection: {
  id: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  accessTokenExpiresAt: Date | null;
}) => {
  const config = getFinverseConfig();
  if (connection.encryptedAccessToken && (connection.accessTokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60_000) {
    return decryptFinverseToken(connection.encryptedAccessToken, config.encryptionKey);
  }
  if (!connection.encryptedRefreshToken) throw new Error("FINVERSE_RELINK_REQUIRED");
  const currentRefreshToken = decryptFinverseToken(connection.encryptedRefreshToken, config.encryptionKey);
  const refreshed = await refreshFinverseToken(currentRefreshToken);
  await prisma.finverseConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptFinverseToken(refreshed.access_token, config.encryptionKey),
      encryptedRefreshToken: encryptFinverseToken(refreshed.refresh_token || currentRefreshToken, config.encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + Math.max(60, refreshed.expires_in) * 1000),
    },
  });
  return refreshed.access_token;
};
