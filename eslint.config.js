import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  pluginJs.configs.recommended,
];