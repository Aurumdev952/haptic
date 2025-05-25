import type { FC } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";

export interface ResponseOption {
  text: string;
  lang: string;
}

interface ResponseOptionsDisplayProps {
  options: ResponseOption[];
  isLoading: boolean;
  onSelect: (option: ResponseOption) => void;
  disabled: boolean;
}

const ResponseOptionsDisplay: FC<ResponseOptionsDisplayProps> = ({
  options,
  isLoading,
  onSelect,
  disabled,
}) => {
  if (isLoading) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-[20px]">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (options.length === 0) {
    return <div className="min-h-[64px] sm:min-h-[64px]"></div>; // Placeholder for height consistency
  }

  return (
    <div
      className={`w-full flex flex-col items-center justify-center gap-[20px]`}
    >
      {options.map((option, index) => (
        <button
          key={index}
          className="bg-[#10141680] px-[20px] py-[15px] rounded-full hover:bg-[#FD5E42] hover:py-[25px] hover:px-[25px] cursor-pointer"
          onClick={() => onSelect(option)}
          disabled={disabled}
          style={{ transition: "0.5s ease-out" }}
          aria-label={`Select response: ${option.text}`}
        >
          <p className={`font-[400] text-[25px] text-[#FFFFFF99]`}>
            {option.text}
          </p>
        </button>
      ))}
    </div>
  );
};

export default ResponseOptionsDisplay;
