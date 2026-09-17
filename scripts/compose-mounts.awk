# Parse only FILEHUB_MOUNT_<alias> entries, without sourcing .env.
function fail(message) {
    print "FileHub mount settings, line " NR ": " message > "/dev/stderr"
    failed = 1
    exit 2
}
function trim(value) {
    sub(/^[ \t]+/, "", value)
    sub(/[ \t]+$/, "", value)
    return value
}
BEGIN { count = 0 }
{
    sub(/\r$/, "")
    line = trim($0)
    if (line == "" || line ~ /^#/) next
    sub(/^export[ \t]+/, "", line)
    if (line !~ /^FILEHUB_MOUNT_/) next
    separator = index(line, "=")
    if (!separator) fail("expected FILEHUB_MOUNT_name=/absolute/path")
    key = trim(substr(line, 1, separator - 1))
    alias = substr(key, length("FILEHUB_MOUNT_") + 1)
    if (alias !~ /^[a-z][a-z0-9_]*$/) fail("name must use lowercase letters, numbers or underscores")
    if (seen[alias]++) fail("duplicate mount name: " alias)
    value = trim(substr(line, separator + 1))
    quote = substr(value, 1, 1)
    if (quote == "\047" || quote == "\042") {
        rest = substr(value, 2)
        closing = index(rest, quote)
        if (!closing) fail("missing closing quote")
        tail = trim(substr(rest, closing + 1))
        if (tail != "" && tail !~ /^#/) fail("unexpected text after quoted path")
        value = substr(rest, 1, closing - 1)
    } else {
        sub(/[ \t]+#.*/, "", value)
        value = trim(value)
    }
    if (value == "") next
    if (substr(value, 1, 1) != "/") fail("host path must be absolute")
    if (value ~ /[[:cntrl:]\\$`"]/) fail("use a literal path without control characters, backslashes, dollar signs, backticks or double quotes")
    if (++count > 100) fail("at most 100 mounts are supported")
    mounts[count] = "{\"type\":\"bind\",\"source\":\"" value "\",\"target\":\"/files/" alias "\",\"bind\":{\"create_host_path\":false}}"
}
END {
    if (failed) exit 2
    printf "{\"services\":{\"filehub\":{\"volumes\":["
    for (i = 1; i <= count; i++) printf "%s%s", (i > 1 ? "," : ""), mounts[i]
    print "]}}}"
}
