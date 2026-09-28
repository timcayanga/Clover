export async function getSignedUrl(
  _client: unknown,
  command: { input: { Key: string } },
  options: { expiresIn: number },
) {
  return `https://private.test/${command.input.Key}?expires=${options.expiresIn}`;
}
