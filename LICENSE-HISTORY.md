# License history

This project changed license once.

| From | To | Effective |
|------|----|-----------|
| MIT | AGPL-3.0-only | the `chore!: relicense` commit (2026) |

- **Every commit and release before the relicense** was licensed under the
  **MIT License**. Copies obtained under those terms remain under MIT; nothing
  revokes the rights already granted.
- **From the relicense onward** the project is licensed under the **GNU Affero
  General Public License v3.0 only** (see [LICENSE](LICENSE)).

The bundled shared library `@rxtx4816/cockpit-plugin-base-react` made the same
MIT → AGPL-3.0-only change in its `2.0.0` release; its npm `1.x` line stays MIT.

## Contributions

RXTX4816 is the sole copyright holder of the code in the AGPL-licensed tree.
The only external contribution in the project's history — commit `2fb499f`
("test: cover env file linting") by Bean Labs, a test file — was reverted in
`4db68f5` and is not present in any released or distributed version. The env
linting it exercised now lives in `@rxtx4816/cockpit-plugin-base-react` under an
independently authored test.

Contributions before the relicense were made under the MIT inbound terms then in
`CONTRIBUTING.md`; contributions after it are under AGPL-3.0-only.
