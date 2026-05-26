# No Inline Scripts Rule

Never run multi-line logic or complex commands as inline shell strings passed to bash.

Instead:
1. Write the logic to a `.sh` script file using `fsWrite`
2. Make it executable with `chmod +x`
3. Run the file

This avoids terminal escaping issues and makes scripts debuggable.

## Examples

Bad:
```
executeBash: python3 -c "import os; ..."
executeBash: bash -c "VAR=foo && do_thing && cleanup"
```

Good:
```
fsWrite: scripts/do_thing.sh  (with full script content)
executeBash: chmod +x scripts/do_thing.sh
executeBash: bash scripts/do_thing.sh
```
