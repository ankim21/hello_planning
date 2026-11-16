// Passwords and PINs are stored only as argon2 hashes.
import argon2 from 'argon2';

export const hashSecret = (secret: string) => argon2.hash(secret);

export const verifySecret = (hash: string, secret: string) =>
  argon2.verify(hash, secret);
