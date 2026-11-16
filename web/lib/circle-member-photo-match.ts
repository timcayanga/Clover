const identity = (name: string) => name.trim().toLocaleLowerCase();
export function resolveCircleMemberPhoto(member: {userId: string | null; displayName: string}, people: {name:string;avatarUrl:string|null}[], userPhotos: Map<string,string>) {
  const ownPhoto = member.userId ? userPhotos.get(member.userId) : null;
  if (ownPhoto) return ownPhoto;
  const matching = people.filter(person => identity(person.name) === identity(member.displayName));
  return matching.length === 1 ? matching[0].avatarUrl : null;
}

