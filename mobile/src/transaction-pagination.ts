export class TransactionPagination {
  private generation = 0;
  private completedPage = 0;
  private requestedPage = 0;
  private deferredEnd = false;
  busy = false;
  begin(page:number): number | null {
    if(page > 1 && (this.busy || page <= this.completedPage)) return null;
    if(page === 1) {this.completedPage = 0;this.deferredEnd=false;}
    this.requestedPage=page;
    this.busy = true;
    return ++this.generation;
  }
  current(ticket:number) { return ticket === this.generation; }
  complete(ticket:number,page?:number) {
    if(!this.current(ticket)) return;
    if(page !== undefined) this.completedPage = page;
    this.busy = false;
  }
  deferEnd() { if(this.busy && this.requestedPage === 1) this.deferredEnd=true; }
  takeDeferredEnd() {
    if(this.busy) return false;
    const deferred=this.deferredEnd;this.deferredEnd=false;return deferred;
  }
  invalidate() {this.generation++;this.busy=false;this.completedPage=0;this.deferredEnd=false;}
}
