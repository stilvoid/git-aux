# Git aux

## Commands

### `git aux init <basedir>`

When in a git repository, initialise git aux to map the repository root to the specified directory.

Under the hood, create a .git/aux.json containing the base dir

### `git aux add <file>`

If the given file is not within the git aux base dir, an error is raise.

Otherwise, add the chosen file to the repository.

### `git aux sync`

Check all files that have been `git aux add`ed for changes outside of the repository and interactively merge them in.

Under the hood, loop through all files, copy from basedir and then `git add -p`

### `git aux apply`

Apply any changes to files in the repository to the corresponding files in the base dir.

## Walkthrough

To manage files in your home dir with git aux, do this:

* `mkdir aux_home`

* `cd aux_home`

* `git init .`

* `git aux init /home/bungle`

* `git aux add /home/bungle/.vimrc /home/bungle/todo_list.txt`

* `git commit -m "Added vimrc and my todo list`

* `git remote add origin bungle@github.com:aux_home.git`

* `git push -u origin master`

On another machine:

* `git clone bungle@github.com:aux_home.git`

* `cd aux_home`

* `git aux init /home/zippy`

* `git aux apply`

Watch your lovely files being merge into your home directory :)

Now edit your todo list:

* `echo Buy some milk >> /home/zippy/todo_list.txt`

And add it back to the repo:

* `git aux sync`

Watch your changes get interactively merged back in

## Tips
