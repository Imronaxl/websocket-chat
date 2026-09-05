import eslintConfigNext from "eslint-config-next";
import eslintConfigNextTypescript from "eslint-config-next/typescript";

export default [
  ...eslintConfigNext,
  ...eslintConfigNextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off",
      "no-console": "off",
      "no-empty": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-compiler/react-compiler": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];
