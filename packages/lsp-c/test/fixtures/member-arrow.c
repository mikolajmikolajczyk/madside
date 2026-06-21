// @expect-all: id, label
struct Node {
  int id;
  char *label;
};

void walk(struct Node *p) {
  p->|
}
