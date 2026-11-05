#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

/* Private, fixed-operation helper. Directory and owner descriptors are inherited;
 * paths never come from a shell. 0 success; 10..18 known pre-effect failures;
 * 70 means the result must be inspected, never blindly retried. */
static int failure(void) {
  switch (errno) {
    case EEXIST: case ENOTEMPTY: return 10;
    case ENOENT: return 11;
    case EACCES: case EPERM: case EROFS: case ELOOP: return 12;
    case EXDEV: return 13;
    case ENOSYS: case EINVAL: case EOPNOTSUPP: return 14;
    case ENOSPC: case EDQUOT: return 15;
    case EWOULDBLOCK: return 16;
    default: return 70;
  }
}
static int basename_hex(const char *hex, char *out) {
  size_t n = strlen(hex);
  if (!n || n > 510 || n % 2) return 0;
  for (size_t i = 0; i < n; i += 2) {
    unsigned value;
    if (sscanf(hex + i, "%2x", &value) != 1 || value < 32 || value == 127 || value == '/') return 0;
    out[i / 2] = (char)value;
  }
  out[n / 2] = 0;
  return strcmp(out, ".") && strcmp(out, "..");
}
int main(int argc, char **argv) {
  if (argc == 2 && !strcmp(argv[1], "lock")) return flock(3, LOCK_EX | LOCK_NB) == 0 ? 0 : failure();
  if (argc == 2 && !strcmp(argv[1], "lock-shared")) return flock(3, LOCK_SH | LOCK_NB) == 0 ? 0 : failure();
  if (argc == 4 && !strcmp(argv[1], "rmdir")) {
    char name[256], expected[128]; struct stat item;
    if (!basename_hex(argv[2], name)) return 18;
    if (fstatat(4, name, &item, AT_SYMLINK_NOFOLLOW)) return failure();
    if (!S_ISDIR(item.st_mode)) return 12;
    snprintf(expected,sizeof(expected),"%ju:%ju",(uintmax_t)item.st_dev,(uintmax_t)item.st_ino);
    if (strcmp(expected,argv[3])) return 17;
    if (unlinkat(4,name,AT_REMOVEDIR)) return failure();
    return fsync(4)==0 ? 0 : 70;
  }
  if (argc == 4 && !strcmp(argv[1], "unlink")) {
    char name[256], expected[256];
    if (!basename_hex(argv[2], name)) return 18;
    struct stat item;
    if (fstatat(4, name, &item, AT_SYMLINK_NOFOLLOW)) return failure();
    if (!S_ISREG(item.st_mode) || item.st_nlink != 1) return 12;
    snprintf(expected, sizeof(expected), "%ju:%ju:%jd:%jd:%jd:%ju", (uintmax_t)item.st_dev, (uintmax_t)item.st_ino,
      (intmax_t)item.st_size, (intmax_t)item.st_mtim.tv_sec * 1000000000 + item.st_mtim.tv_nsec,
      (intmax_t)item.st_ctim.tv_sec * 1000000000 + item.st_ctim.tv_nsec, (uintmax_t)item.st_mode);
    if (strcmp(expected, argv[3])) return 17;
    if (unlinkat(4, name, 0)) return failure();
    return fsync(4) == 0 ? 0 : 70;
  }
  if (argc != 5 || strcmp(argv[1], "rename")) return 18;
  char source[256], target[256], witness[256];
  if (!basename_hex(argv[2], source) || !basename_hex(argv[3], target)) return 18;
  struct stat stat;
  if (fstatat(4, source, &stat, AT_SYMLINK_NOFOLLOW)) return failure();
  if (!S_ISREG(stat.st_mode) && !S_ISDIR(stat.st_mode)) return 12;
  snprintf(witness, sizeof(witness), "%ju:%ju:%jd:%jd:%jd:%ju", (uintmax_t)stat.st_dev, (uintmax_t)stat.st_ino,
    (intmax_t)stat.st_size, (intmax_t)stat.st_mtim.tv_sec * 1000000000 + stat.st_mtim.tv_nsec,
    (intmax_t)stat.st_ctim.tv_sec * 1000000000 + stat.st_ctim.tv_nsec, (uintmax_t)stat.st_mode);
  if (strcmp(witness, argv[4])) return 17;
  if (renameat2(4, source, 5, target, RENAME_NOREPLACE)) return failure();
  if (fsync(4) || fsync(5)) return 70;
  return 0;
}
