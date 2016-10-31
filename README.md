ztrace
======

[![NPM Version](https://img.shields.io/npm/v/ztrace.svg?style=flat)](https://npmjs.org/package/ztrace)
[![Build Status](https://travis-ci.org/addaleax/ztrace.svg?style=flat&branch=master)](https://travis-ci.org/addaleax/ztrace?branch=master)
[![Coverage Status](https://coveralls.io/repos/addaleax/ztrace/badge.svg?branch=master)](https://coveralls.io/r/addaleax/ztrace?branch=master)

Trace what your program does, inspired by `strace(1)`.

Install:
`[sudo] npm install -g ztrace`

Usage:

`test.js`:
```js
const fs = require('fs');

fs.statSync('/');
```

Look at the `fs.stat` call in action:

```sh
$ ztrace -e fs.stat* -s unlimited ./test.js
fs.statSync('/')
 @fs.stat('/') = { dev: 2049, mode: 16877, nlink: 25, uid: 0, gid: 0, rdev: 0, blksize: 4096, ino: 2, size: 4096, blocks: 8, atime: 2016-10-31T08:45:52.988Z, mtime: 2016-10-23T16:04:32.775Z, ctime: 2016-10-23T16:04:32.775Z, birthtime: 2016-10-23T16:04:32.775Z }
-> { dev: 2049, mode: 16877, nlink: 25, uid: 0, gid: 0, rdev: 0, blksize: 4096, ino: 2, size: 4096, blocks: 8, atime: 2016-10-31T08:45:52.988Z, mtime: 2016-10-23T16:04:32.775Z, ctime: 2016-10-23T16:04:32.775Z, birthtime: 2016-10-23T16:04:32.775Z }
```

(`@fs.stat` is the call to the C++ layer itself.)

If you want to trace everything, you can do that using just `ztrace ./test.js`
– but be warned: This is still *very* slow.

License
=======

<details>

<summary>GPL-3.0+, at least for now.</summary>

Copyright (C) 2016 Anna Henningsen

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

</details>
