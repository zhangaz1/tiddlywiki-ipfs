#!/bin/bash
# cleanup
rm -f -R ./build > /dev/null 2>&1
rm -f -R ./output > /dev/null 2>&1

# build directories
mkdir -p ./build/plugins/ipfs/core > /dev/null 2>&1

# core scripts
cp -R ./src/core/* ./build/plugins/ipfs/core > /dev/null 2>&1

# don't copy sub-directories, they are meant to be bundled
cp ./src/* ./build/plugins/ipfs > /dev/null 2>&1

# plugin tiddlers
cp -R ./tiddlers/plugin/* ./build/plugins/ipfs > /dev/null 2>&1

# modules
cp ./metadata/tiddlywiki.files ./build/plugins/ipfs/files > /dev/null 2>&1

# loglevel
cp -R ./loglevel ./build/plugins/loglevel > /dev/null 2>&1
cp -R ./metadata/loglevel ./build/plugins/loglevel > /dev/null 2>&1

# generate build number
./scripts/run-build-number.sh \
|| exit 1

exit 0
