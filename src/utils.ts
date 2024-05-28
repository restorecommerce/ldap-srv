// Fixes a bug where case-sensitive requests get lowercased and attributes don't get sent
// https://github.com/ldapjs/node-ldapjs/pull/971
//
// We just add all the same attributes but lowercased to the requested ones
export const allAttributeFix = () => {
  return (req: any, res: any, next: any) => {
    res.attributes = [
      ...res.attributes,
      ...res.attributes.map((s: string) => s.toLowerCase())
    ];
    return next();
  };
};

export const withLowercase = (obj: any) => {
    return {
      ...obj,
      ...Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]))
    };
};
