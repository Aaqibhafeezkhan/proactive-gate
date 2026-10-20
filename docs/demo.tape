# Records docs/assets/demo.gif. Run it through scripts/record-demo.sh, which installs the packed
# package into $DEMO_DIR first so the recording shows the command a reader would run.
Output docs/assets/demo.gif
Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 520
Set Framerate 10
Set Padding 14
Set Theme "Dracula"
Set TypingSpeed 40ms
Hide
Type 'cd "$DEMO_DIR" && export PS1="$ " && clear'
Enter
Show
Sleep 800ms
Type "npx proactive-gate simulate --limit 6 | head -n 24"
Sleep 400ms
Enter
Sleep 10s
