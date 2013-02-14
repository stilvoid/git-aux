#!/bin/bash

ga_help() {
    echo "usage: $0 [command] <[arguments]>"
    echo
    echo "Commands:"
    echo "   init    Do a thing"
    echo "   sync    Do a thing"
    echo "   apply   Do a thing"
}

die() {
    echo $@
    exit 1
}

last_commit() {
    echo $(git show |grep ^commit | cut -d ' ' -f 2) || die "Not a git repository"
}

current_branch() {
    echo $(git branch | grep "^*" | sed -e 's/^\*\s*//') || die "Not a git repository"
}

git_root() {
    git rev-parse --show-toplevel || die "Not a git repository"
}

aux_dir() {
    cat $(git_root)/.git/aux/config || die "Not a git aux repository"
}

repo_files() {
    find $(git_root) -type f -not -path "$(git_root)/.git/*"
}

relative() {
    local file=$1
    local dir=$2

    echo $file | sed -e "s/^$(echo $dir | sed -e 's/\//\\\//g')\///"
}

ga_init() {
    if [ -e $(git_root)/.git/aux ]; then
        die "This repo is already initialised for use with aux: $(aux_dir)"
    else
        mkdir -p $(git_root)/.git/aux
        echo $(readlink -f $1) > $(git_root)/.git/aux/config
    fi
}

ga_add_all() {
    # Add files to repo
    if [ "$1" == "-f" ]; then
        git add -u
    else
        git add -p
    fi

    # Add new files too
    if [ -n "$(git ls-files -o --exclude-standard)" ]; then
        git add $(git ls-files -o --exclude-standard)
    fi
}

ga_add() {
    for file in $@; do
        local file=$(readlink -f $file)
        local rel_path=$(relative $file $(aux_dir))

        if [ -z "$(find "$file" -type f -path "$(aux_dir)*")" ]; then
            die "$file is not in the aux root"
        else
            echo "Adding $file"
            cp -af "$file" "$(git_root)/$rel_path"
            git add "$(git_root)/$rel_path"
        fi
    done
}

ga_sync() {
    for file in $(repo_files); do
        file=$(relative $file $(git_root))

        rm -r $(git_root)/$file
        # Copy or remove file/dir
        if [ -e "$(aux_dir)/$file" ]; then
            cp -af "$(aux_dir)/$file" "$(git_root)/$file"
        fi
    done

    ga_add_all $@

    # Show status
    git status
}

ga_apply() {
    local current_branch=$(current_branch)
    local temp_branch=git-aux-temp-$RANDOM

    local stashed=true

    echo $current_branch $temp_branch

    if [ "$(git stash save -u)" == "No local changes to save" ]; then
        stashed=false
    fi

    echo git checkout -b "$temp_branch"
    git checkout -b "$temp_branch"

    ga_sync -f

    echo git commit -a -m "Temp"
    git commit -a -m "Temp"

    local last_commit=$(last_commit)

    echo git reset --hard "$current_branch"
    git reset --hard "$current_branch"

    echo git reset "$last_commit"
    git reset "$last_commit"

    ga_add_all

    echo git commit -m "Temp 2"
    git commit -m "Temp 2"

    echo git reset --hard HEAD
    git reset --hard HEAD

    ga_add_all

    # Copy the files home
    for file in $(repo_files); do
        file=$(relative $file $(git_root))
        
        mkdir -p "$(dirname $(aux_dir)/$file)" || {
            # This catches the edge case that we've moved from a file to a directory
            rm -r "$(dirname $(aux_dir)/$file)"
            mkdir -p "$(dirname $(aux_dir)/$file)"
        }
        cp -af "$(git_root)/$file" "$(aux_dir)/$file"
    done

    echo git checkout "$current_branch"
    git checkout "$current_branch"

    echo git branch -D "$temp_branch"
    git branch -D "$temp_branch"

    if $stashed; then
        git stash pop
    fi

    echo "Done"
}

ga_diff() {
    echo "Not yet implemented"
}

command=$1
shift
args=$@

case $command in
    init) ga_init ${args[0]} ;;
    add) ga_add $args ;;
    sync) ga_sync ;;
    apply) ga_apply ;;
    diff) ga_diff ;;
    *) ga_help ;;
esac

