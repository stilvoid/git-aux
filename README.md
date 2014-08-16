# Git-aux

Git-aux is a simple script to help with managing a collection of often-used, often-replicated files such as dotfiles in a home directory.

Using git-aux, you can create a repository, add files to it from a chosen folder (e.g. your home directory), push the changes and keep the necessary files in sync between different machines.

Using git's already-powerful branching, merging, and rebasing, you can keep modified versions of a home folder in sync.

## Usage

To use git-aux, just add it to your path and it will be usable either as `git-aux` or `git aux`.

## Commands

### `git aux init <basedir>`

When in a git repository, initialise git aux to map the repository root to the specified directory.

### `git aux add <file>`

If the given file is not within the git aux base dir, an error is raise.

Otherwise, add the chosen file to the repository.

### `git aux sync`

Check all files that have been `git aux add`ed for changes outside of the repository and interactively merge them in.

### `git aux apply`

Apply any changes to files in the repository to the corresponding files in the base dir.

## Walkthrough

To manage files in your home dir with git aux, do this:

### Create a standard git repository

* `mkdir aux_home`

* `cd aux_home`

* `git init .`

### Initialise git-aux with your home directory

* `git aux init /home/bungle`

### Add some files to track

* `git aux add /home/bungle/.vimrc /home/bungle/todo_list.txt`

* `git commit -m "Add vimrc and todo list"`

### Push to a remote

* `git remote add origin bungle@github.com:aux_home.git`

* `git push -u origin master`

Later, on another machine:

### Clone the repository

* `git clone bungle@github.com:aux_home.git`

* `cd aux_home`

### Initialise this copy of the repository with your home directory

* `git aux init /home/zippy`

### Apply the saved files

* `git aux apply`

### Make some changes

* `echo Buy some milk >> /home/zippy/todo_list.txt`

### Sync them back into the repo

* `git aux sync`

## Further examples

### Making use of git branches to track differences between different machines.

Often, you will find that you want to keep most of a file in sync but have changes on some machines. I find my `.bashrc` is frequently an example of this.

To get around the issue, I use a `master` branch to represent a base set of what I want in my home dir and then a separate branch per machine to hold machine-specific modifications.

For example, I might want the following in my `.bashrc` on all machines:

    alias ls="ls --color=auto"
    export PATH=$PATH:~/bin

But on my work machine, I may want to add another entry to `PATH`.

    alias ls="ls --color=auto"
    export PATH=$PATH:~/bin:/opt/android/bin

The solution is to add the basic `.bashrc` above to the `master` branch then switch to the `work` branch and make the changes. If I later want to add something new to all of my machines, I add it to the `master` branch.

When I come to apply changes on my work machine, I checkout the `work` branch and rebase it with `master`. That way I get the new features but also keep my work-specific modifications.
