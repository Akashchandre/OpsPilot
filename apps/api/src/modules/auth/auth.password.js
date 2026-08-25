import argon2 from "argon2";

const passwordHashOptions = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

let dummyHashPromise;

export function hashPassword(password) {
  return argon2.hash(password, passwordHashOptions);
}

export function verifyPassword(passwordHash, password) {
  return argon2.verify(passwordHash, password);
}

export function getDummyPasswordHash() {
  dummyHashPromise ??= hashPassword(
    "OpsPilot timing equalization value; never an account password.",
  );
  return dummyHashPromise;
}
