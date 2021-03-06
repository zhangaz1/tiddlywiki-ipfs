#!/usr/bin/env bash

./scripts/run-prepare.sh || exit 1

./scripts/run-browserify.sh || exit 1

./scripts/build-ipfs-tiddlywiki.sh || exit 1

# lint
yarn lint || exit 1

# format
yarn format || exit 1

./scripts/build-tiddlywiki.sh || exit 1

exit 0
