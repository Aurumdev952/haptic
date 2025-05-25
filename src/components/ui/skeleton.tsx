import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse bg-[#10141680] w-[40%] rounded-full", className)}
      {...props}
    />
  )
}

export { Skeleton }
