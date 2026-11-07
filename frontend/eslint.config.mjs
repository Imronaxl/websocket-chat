import eslintConfigNext from "eslint-config-next";
import eslintConfigNextTypescript from "eslint-config-next/typescript";

const config = [
  ...eslintConfigNext,
  ...eslintConfigNextTypescript,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"],
  },
];

export default config;
