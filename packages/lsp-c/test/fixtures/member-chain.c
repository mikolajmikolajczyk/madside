// @expect-all: x, y
struct Point {
  int x;
  int y;
};
struct Line {
  struct Point start;
  struct Point end;
};

void run(void) {
  struct Line l;
  l.start.|
}
