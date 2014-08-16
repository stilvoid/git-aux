PREFIX=/usr/local

install: git-aux
	install -Dm755 git-aux $(PREFIX)/bin/git-aux
	install -Dm755 COPYING $(PREFIX)/share/doc/git-aux/COPYING
	install -Dm755 README.md $(PREFIX)/share/doc/git-aux/README.md
