# Optional local validation toolchain, installed in .tools (not shipped).
# Usage from repository root: source scripts/env-wsl.sh
export RUSTUP_HOME="$PWD/.tools/rustup"
export CARGO_HOME="$PWD/.tools/cargo"
export PATH="$PWD/.tools/bin:$CARGO_HOME/bin:$PWD/.tools/sysroot/usr/lib/llvm-21/bin:$PATH"
export LD_LIBRARY_PATH="$PWD/.tools/sysroot/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CC="$PWD/.tools/sysroot/usr/bin/x86_64-linux-gnu-gcc-15"
export XWIN_CACHE_DIR="$PWD/.tools/xwin"
export NSISDIR="$PWD/.tools/sysroot/usr/share/nsis"
